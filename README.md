# VisioFlow — Supabase ativo

O projeto mzeflmnyspgotnpbpqon está configurado. As migrações connected.sql e hardening.sql foram aplicadas em 18/11/2026; as quatro contas foram criadas e confirmadas com Supabase Auth. Não é necessário executar o SQL novamente para usar este projeto.

## Publicar

Envie os arquivos atualizados ao GitHub e publique no Vercel como site estático. A URL e a chave anon pública ficam em supabase-config.js. Nunca inclua service_role no frontend. Arquivos .env não são lidos por este site estático.

Entradas:
- /acesso/instituicao — teste@parceiro.com
- /acesso/clinica — teste@clinica.com
- /acesso/otica — teste@otica.com
- /acesso/admin — igormoncao86@gmail.com

A senha inicial foi definida durante a ativação e não está gravada no código. A função temporária de criação foi substituída por um endpoint que retorna 410, sem capacidade administrativa.

## Operações conectadas

Cadastro, validação, receita, orçamento, produção, entrega, notificações, leitura de repasses e exclusão administrativa usam RPCs autenticados. A rota instituição → clínica → ótica está cadastrada em vf_routes. O banco determina o papel e limita os registros aos envolvidos. A instituição acompanha status e valor, sem os campos clínicos da receita. RLS está ativo e o acesso direto às tabelas está revogado para anon/authenticated.

Atualizações são consultadas a cada 15 segundos enquanto a aba estiver visível. A sessão fica no sessionStorage; dados clínicos ficam em memória. Uma falha não aciona modo de demonstração. Gravações só são confirmadas depois da resposta do banco.

WhatsApp abre mensagem para envio manual; envio automático não está integrado. Repasses são cadastrados em vf_payments pelo administrador no banco; marcar como pago registra a informação e não transfere dinheiro. Uma receita por indicação é permitida nesta versão.

## Verificação realizada

- Login real e leitura autenticada: HTTP 200 para os quatro perfis.
- Transação no PostgreSQL com rollback: cadastro, isolamento entre instituições, rejeição de validação por instituição, validação única, privacidade da receita, orçamento e entrega.
- node tests/supabase.cjs: inicialização sem dados locais, JWT nas operações, propagação de falhas e renderização das rotas dos quatro perfis.
- Verificação de sintaxe dos arquivos JavaScript.

A interface ainda precisa de conferência visual na URL publicada. Os testes de banco foram revertidos, sem cadastrar pacientes de exemplo.

Para reinstalar em outro projeto: execute connected.sql, crie as contas no Auth, ajuste os e-mails e execute bootstrap.sql. hardening.sql fecha helpers anônimos do esquema anterior, se existirem.
