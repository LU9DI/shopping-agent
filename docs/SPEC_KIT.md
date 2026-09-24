# Spec Kit — Shopping Agent

## Objetivo
Agente de compras com listas persistentes, histórico de preços, alertas por preço-alvo e acompanhamento de comerciantes.

## Estado atual
- Landing page e área autenticada responsivas
- Watchlists com CRUD e limite operacional
- Histórico/analytics com tendências
- Drill-down de indicadores e exportação CSV
- Ações rápidas no dashboard
- Autenticação, perfil, notificações e atividade
- Deploy de produção validado

## Critérios de qualidade
- Isolamento por usuário em todos os recursos
- Validação de UUID, paginação e valores monetários
- Limites de consulta e criação para evitar abuso
- Erros de API sem exposição de detalhes internos
- Migrações idempotentes

## Próximas evoluções
1. Alertas reais e histórico de disparos
2. Jobs de atualização de preços com retry/idempotência
3. Integração de múltiplas fontes de preço
4. Testes automatizados de domínio e rotas críticas
5. Observabilidade e métricas de negócio
