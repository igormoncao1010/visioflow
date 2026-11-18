# VisioFlow

Plataforma de gestão visual para conectar instituições indicadoras, clínicas oftalmológicas, óticas e administração em uma jornada de atendimento.

## O que está pronto

- Interface responsiva com os quatro espaços de trabalho e navegação específica por perfil.
- Tela de login de demonstração com contas de instituição, clínica, ótica e administrador.
- Links dedicados `/acesso/instituicao`, `/acesso/clinica`, `/acesso/otica` e `/acesso/admin`; o administrador gera e copia esses endereços em **Acessos**.
- Demonstração clicável dos fluxos de indicação com voucher QR/código, validação pela clínica, envio de receita, orçamento e abertura da mensagem de WhatsApp.
- Visão administrativa de parceiros, indicadores, relatórios e repasses.
- Ações demonstrativas salvas no `localStorage` do navegador.
- Esquema inicial para Supabase em `supabase/schema.sql`, com papéis, tabelas, RLS e notificação de validação.

## Rodar e publicar

O projeto é estático: abra `index.html` localmente ou importe o repositório no Vercel. Não precisa de build nem dependências. O `vercel.json` mantém as rotas da aplicação apontando para a página inicial.

Para conectar o banco, execute `supabase/schema.sql` no SQL Editor do projeto Supabase. Depois, configure `SUPABASE_URL` e `SUPABASE_ANON_KEY` como variáveis de ambiente no Vercel. A chave anon/publishable é pública por definição e depende das políticas RLS; **nunca coloque a chave `service_role` no navegador ou em arquivos do frontend**.

## Próxima etapa de integração

**Os logins atualmente são contas de demonstração e as senhas de teste estão verificadas no JavaScript do navegador.** Isso não oferece autenticação nem isolamento de dados seguros. Não use os mesmos logins em produção nem coloque dados reais de pacientes nesta versão. A autenticação real precisa usar Supabase Auth; a criação de usuários e convites pelo administrador deve passar por uma função backend protegida, sem expor `service_role`.

Este primeiro corte é um protótipo de interface: gravação no Supabase, câmera para leitura de QR e disparo automático de mensagens ainda precisam ser ligados aos serviços. O WhatsApp abre uma conversa com texto pronto quando o navegador permite. Para envio automático, use a WhatsApp Business Platform por uma função backend e mantenha tokens de serviço fora do frontend. Para produção, configure recuperação de senha, convite de usuário, logs de auditoria, consentimento e política de retenção para os dados de saúde.

## Segurança

O voucher é um identificador e não deve expor receita ou dados clínicos. A receita contém dados sensíveis: compartilhe apenas entre clínica e ótica responsável, proteja o acesso com RLS e evite colocar informações clínicas no QR code ou em mensagens públicas.
