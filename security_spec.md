# Especificação de Segurança e Matriz de Invariantes — Victoria Lar Residencial

Esta especificação define formalmente os controles de segurança, políticas de controle de acesso baseado em atributos e papéis (ABAC/RBAC), proteções contra escalação de privilégios e garantias de preservação de dados para o sistema **Victoria Lar Residencial**.

---

## 1. Invariantes de Dados e Segurança

1. **Invariante de Bloqueio Padrão (Zero-Trust Default Deny)**:
   Qualquer caminho não explicitamente autorizado tem leitura e escrita sumariamente negadas no nível raiz (`allow read, write: if false;`).

2. **Invariante do Administrador Ativo (Live Active Check)**:
   A autorização administrativa exige estritamente um documento ativo e verificado na coleção `/admins/{uid}` (`active == true`). O endereço de e-mail por si só **não** confere privilégios caso o registro esteja ausente ou desativado (`active == false`). Desativações removem o acesso em tempo real.

3. **Invariante da Autoridade Exclusiva do Superadministrador**:
   Apenas um usuário com registro ativo e papel explícito `role == 'superadmin'` pode convidar, promover, rebaixar ou excluir administradores em `/admins/{uid}`. Administradores comuns (`role == 'admin'`) não têm acesso de mutação em `/admins`.

4. **Invariante de Bootstrap Confiável de Uso Único (Server-Sealed)**:
   O processo de bootstrap inicial (`/system/bootstrap`) é realizado com exclusividade pela infraestrutura confiável do servidor (`POST /api/bootstrap/initiate`). Uma vez concluído com `lockedPermanently: true`, nenhuma operação subsequente de bootstrap é autorizada (proteção contra repetição e substituição). Clientes SDK não têm permissão de escrita direta em `/system/bootstrap`.

5. **Invariante de Proteção ao Último Superadministrador**:
   O sistema impede, via transação de concorrência com verificação no documento `/system/superAdminGuard`, que a contagem de superadministradores ativos caia para zero, garantindo que o painel de administração jamais fique inacessível por desativação acidental ou concorrente.

6. **Invariante de Isolamento de Rascunhos ("Rules Are Not Filters")**:
   Serviços em rascunho (`status == 'draft'`) e álbuns em rascunho (`status == 'draft'`) jamais podem ser lidos ou listados por visitantes não-administradores. Consultas públicas de listagem DEVEM aplicar os filtros de restrição (`where("status", "==", "published")`).

7. **Invariante de Mídias de Estrutura e Vinculação Relacional**:
   Visitantes leem exclusivamente mídias com `published == true` pertencentes a álbuns oficiais que estejam com `status == 'published'`. Fotos ocultas ou de álbuns em rascunho permanecem totalmente restritas.

8. **Invariante de Privacidade e Blindagem de PII (Leads)**:
   A coleção `/leads/{leadId}` contém dados pessoais de famílias e idosos (nome, telefone, e-mail). O público externo jamais pode ler ou listar leads. A criação pública de leads (`isValidPublicLead`) aceita apenas campos estritamente delimitados e impõe `status: 'unread'`, rejeitando categoricamente campos privilegiados como `notes`, links de reunião arbitrários ou status administrativos alterados.

9. **Invariante de Integridade de Conteúdo Institucional**:
   O público tem acesso de leitura exclusivamente aos documentos de apresentação institucional identificados (`hero`, `about`, `values`, `owner_1`, `owner_2`, `scheduling` e espelhos de álbuns). Rascunhos internos, anotações de diretoria e parâmetros administrativos mantêm-se privados (`allow list: if isActiveAdmin()`).

10. **Invariante de Não-Destrutividade e Preservação de Dados**:
    Falhas temporárias de rede ou rejeições de permissão jamais são tratadas como base de dados vazia. Nenhuma rotina de seed sobrescreve dados cadastrados pela administração.

---

## 2. Matriz de Vetores de Ataque e Testes de Penetração (Dirty Dozen Extended)

| # | Vetor de Ataque | Alvo | Carga / Cenário Malicioso | Resultado Esperado | Status do Teste |
|---|----------------|------|---------------------------|-------------------|-----------------|
| 1 | **Self-Promotion to SuperAdmin** | `/admins/{uid}` | Visitante anônimo cria registro de superadmin para si | `PERMISSION_DENIED` | **PASS (Test 01)** |
| 2 | **User Self-Privilege Escalation** | `/admins/{uid}` | Usuário autenticado comum tenta elevar seu role para superadmin | `PERMISSION_DENIED` | **PASS (Test 02)** |
| 3 | **Unauthorized Admin Tampering** | `/admins/{sa_uid}` | Administrador comum tenta alterar papel do superadministrador | `PERMISSION_DENIED` | **PASS (Test 03)** |
| 4 | **Admin Deletion by Non-SuperAdmin** | `/admins/{uid}` | Administrador comum tenta deletar outro usuário | `PERMISSION_DENIED` | **PASS (Test 04)** |
| 5 | **Bootstrap Replay Attack** | `/system/bootstrap` | Tentativa de sobrescrever documento selado para reabrir setup | `PERMISSION_DENIED` | **PASS (Test 05)** |
| 6 | **Zero-SuperAdmin Lockout** | `/system/superAdminGuard` | Tentativa de atualizar contador de superadministradores para 0 | `PERMISSION_DENIED` | **PASS (Test 06)** |
| 7 | **Revoked Admin Draft Snooping** | `/services/draft_serv` | Administrador desativado tenta ler serviço em rascunho | `PERMISSION_DENIED` | **PASS (Test 07)** |
| 8 | **Revoked Admin Write Attempt** | `/services/pub_serv` | Administrador desativado tenta salvar ou alterar serviço | `PERMISSION_DENIED` | **PASS (Test 08)** |
| 9 | **Revoked Admin Leads Snooping** | `/leads` (list) | Administrador desativado tenta consultar leads privados | `PERMISSION_DENIED` | **PASS (Test 09)** |
| 10| **Revoked Admin Content Mutate** | `/content/hero` | Administrador desativado tenta alterar conteúdo da página inicial | `PERMISSION_DENIED` | **PASS (Test 10)** |
| 11| **Public Lead Exfiltration (get)** | `/leads/{leadId}` | Visitante anônimo tenta obter documento de lead | `PERMISSION_DENIED` | **PASS (Test 11)** |
| 12| **Public Leads Collection Dump** | `/leads` (list) | Visitante anônimo tenta consultar listagem de todos os leads | `PERMISSION_DENIED` | **PASS (Test 12)** |
| 13| **Internal Config Snooping** | `/content/internal_notes` | Visitante tenta ler documento reservado de notas internas | `PERMISSION_DENIED` | **PASS (Test 13)** |
| 14| **Content Collection Query Scraping** | `/content` (list) | Visitante anônimo tenta listar documentos de configuração | `PERMISSION_DENIED` | **PASS (Test 14)** |
| 15| **Lead Privilege Injection (Notes)** | `/leads/{id}` (create) | Visitante tenta injetar campo `notes` reservado a operadores | `PERMISSION_DENIED` | **PASS (Test 15)** |
| 16| **Meeting Phishing URL Injection** | `/leads/{id}` (create) | Visitante tenta gravar URL de phishing no campo `meetingLink` | `PERMISSION_DENIED` | **PASS (Test 16)** |
| 17| **Lead Status Spoofing** | `/leads/{id}` (create) | Visitante tenta criar lead com `status: 'scheduled'` direto | `PERMISSION_DENIED` | **PASS (Test 17)** |
| 18| **Draft Album Snooping** | `/albums/draft_album` | Visitante tenta acessar álbum de estrutura não publicado | `PERMISSION_DENIED` | **PASS (Test 18)** |
| 19| **Draft Photo Snooping** | `/albums/.../photos/draft` | Visitante tenta ler foto em rascunho de álbum publicado | `PERMISSION_DENIED` | **PASS (Test 19)** |
| 20| **Unpublished Album Photo Snooping**| `/albums/draft/.../photos` | Visitante tenta ler foto de álbum que se encontra em rascunho | `PERMISSION_DENIED` | **PASS (Test 20)** |
| 21| **Unconstrained Photo List** | `/albums/.../photos` | Consulta pública sem `where('published', '==', true)` | `PERMISSION_DENIED` | **PASS (Test 21)** |
| 22| **Audit Log Actor Forgery** | `/auditLogs/{id}` | Administrador tenta forjar UID de outro usuário no log | `PERMISSION_DENIED` | **PASS (Test 22)** |

---

## 3. Matriz de Autorização por Papel

| Recurso / Coleção | Operação | Visitante Público | Usuário Autenticado Geral | Administrador Ativo (`admin`) | Superadministrador Ativo (`superadmin`) |
|-------------------|----------|-------------------|---------------------------|-------------------------------|----------------------------------------|
| `/services` | get / list | Apenas `status == 'published'` | Apenas `status == 'published'` | Todos (rascunhos e publicados) | Todos |
| `/services` | create / update / delete | Negado | Negado | Permitido (com validação estrita) | Permitido |
| `/content` | get | Chaves institucionais públicas | Chaves institucionais públicas | Todos os documentos | Todos os documentos |
| `/content` | list | Negado | Negado | Permitido | Permitido |
| `/content` | create / update | Negado | Negado | Permitido | Permitido |
| `/content` | delete | Negado | Negado | Negado (imutabilidade de estrutura) | Negado |
| `/albums` | get / list | Apenas `status == 'published'` | Apenas `status == 'published'` | Todos os álbuns | Todos os álbuns |
| `/albums` | create / update / delete | Negado | Negado | Permitido | Permitido |
| `/albums/.../photos` | get / list | Apenas `published == true` | Apenas `published == true` | Todas as fotos | Todas as fotos |
| `/albums/.../photos` | create / update / delete | Negado | Negado | Permitido | Permitido |
| `/leads` | get / list | Negado | Negado | Permitido | Permitido |
| `/leads` | create | Permitido (apenas `isValidPublicLead`) | Permitido | Permitido | Permitido |
| `/leads` | update | Negado | Negado | Permitido | Permitido |
| `/leads` | delete | Negado | Negado | Negado | Permitido |
| `/admins` | get | Negado | Apenas próprio UID | Apenas próprio UID | Todos |
| `/admins` | list | Negado | Negado | Permitido | Permitido |
| `/admins` | create / update / delete | Negado | Negado | Negado | Permitido (proteção OCC de último superadmin) |
| `/system/bootstrap` | get | Permitido (leitura de status) | Permitido | Permitido | Permitido |
| `/system/bootstrap` | write | Negado | Negado | Negado (servidor exclusivo) | Negado (servidor exclusivo) |
| `/system/superAdminGuard` | get | Negado | Negado | Permitido | Permitido |
| `/system/superAdminGuard` | write | Negado | Negado | Negado | Permitido (com OCC e contagem >= 1) |
| `/auditLogs` | get / list | Negado | Negado | Permitido | Permitido |
| `/auditLogs` | create | Negado | Negado | Permitido (com binding de UID) | Permitido (com binding de UID) |
| `/auditLogs` | update / delete | Negado | Negado | Negado (append-only estrito) | Negado |

---

## 4. Plano de Compatibilidade e Persistência de Mídias (Fase 3)

### Decisão de Fonte Oficial:
1. **Fonte Primária Oficial**: Coleções nativas `/albums/{albumId}` e subcoleção `/albums/{albumId}/photos/{photoId}`.
2. **Camada de Compatibilidade Não-Destrutiva**: O documento `/content/album_{albumId}` é mantido em sincronia contínua, garantindo que instalações legadas ou leituras anteriores continuem funcionando sem descontinuidade.
3. **Plano Firebase Spark**: Todas as imagens externas permanecem hospedadas no Google Drive com entrega otimizada de stream direto via CDN (`mediaUrlHelper.ts`), gerando zero custo de egress no Cloud Storage e sem estouro de cota do Spark.
4. **Armazenamento de Sessão Volátil**: Proibição estrita de `localStorage`, `sessionStorage` e IndexedDB atendida integralmente (estado em memória React e persistência em memória do Firebase Auth).

---

## 5. Procedimento de Verificação e Rollback de Segurança

### Verificação do Superadministrador Inicial:
1. Acesse o portal administrativo pelo botão "Painel ADM" ou via URL de desenvolvimento.
2. Conecte-se com a conta institucional oficial: `victorialarresidencial@gmail.com`.
3. Verifique se o status exibido no cabeçalho é: `victorialarresidencial@gmail.com • Superadministrador`.
4. Confirme no banco Firestore a existência do documento `/admins/{uid}` com `role: 'superadmin'` e `active: true`.
5. Confirme que `/system/bootstrap` possui `lockedPermanently: true` e `status: 'COMPLETED'`.

### Plano de Reversão Controlada (Rollback):
Se por qualquer motivo uma alteração de regras causar bloqueio legítimo:
1. O arquivo `firestore.rules.backup` ou a versão prévia validada pode ser restaurada imediatamente.
2. Caso ocorra erro de concorrência no `/system/superAdminGuard`, a contagem pode ser resincronizada via endpoint autenticado de diagnóstico.
3. Nenhuma migração executou exclusão física de documentos, preservando 100% da integridade dos serviços e álbuns já cadastrados.

---

## 6. Configuração e Roteamento do Banco de Dados Firestore `(default)`

1. **Alinhamento do Banco Oficial**:
   - Projeto Firebase: `victoria-lar-residencial` (preservado integralmente).
   - Banco Firestore: `(default)` em substituição ao identificador nomeado prévio.
   - O `firebase.json` associa as regras de segurança `firestore.rules` explicitamente ao banco `(default)`.
   - O arquivo `firebase-applet-config.json` declara `"firestoreDatabaseId": "(default)"`.

2. **Paridade Cliente e Servidor**:
   - **Cliente React (`src/lib/firebase.ts`)**: Quando o banco for `(default)` ou omitido, executa `getFirestore(app)` sem parâmetro secundário.
   - **Servidor Node.js (`server/firebaseAdmin.ts`)**: Quando o banco for `(default)` ou omitido, executa `getFirestore(app)` sem parâmetro secundário.
   - Variáveis de ambiente (`VITE_FIREBASE_DATABASE_ID` e `FIREBASE_DATABASE_ID`) têm precedência uniforme em ambas as camadas, garantindo sincronia total e ausência de divergência entre cliente e servidor.
   - Todos os fallbacks legados que apontavam para o identificador antigo foram removidos.

3. **Bloqueio Rigoroso de Testes Contra Produção**:
   - Em ambiente de teste (`NODE_ENV=test`), tanto o cliente (`src/lib/firebase.ts`) quanto o servidor (`server/firebaseAdmin.ts`) exigem a presença de `FIRESTORE_EMULATOR_HOST`.
   - Se o emulador local não estiver configurado, qualquer tentativa de conexão dispara imediatamente uma exceção fatal, impedindo qualquer acesso acidental ao Firestore de produção.

