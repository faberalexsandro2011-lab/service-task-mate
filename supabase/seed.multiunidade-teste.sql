-- Fixture-only seed for the isolated central-os-multiunidade-teste project.
-- These accounts use reserved .invalid addresses and have no password; they are not login accounts.
-- Never apply this file to production.

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','teste.admin.vale@example.invalid',now(),'{"provider":"email","providers":["email"]}','{"nome":"Admin Vale - TESTE"}',now(),now(),false,false),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','teste.admin.nova@example.invalid',now(),'{"provider":"email","providers":["email"]}','{"nome":"Admin Nova - TESTE"}',now(),now(),false,false),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','teste.admin.jussara@example.invalid',now(),'{"provider":"email","providers":["email"]}','{"nome":"Admin Jussara - TESTE"}',now(),now(),false,false),
 ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','teste.gestor.central@example.invalid',now(),'{"provider":"email","providers":["email"]}','{"nome":"Gestor Central - TESTE"}',now(),now(),false,false)
on conflict (id) do nothing;

insert into public.usuarios_unidades (user_id, unidade_id, perfil, ativo)
select v.user_id, u.id, v.perfil, true
from (values
 ('10000000-0000-4000-8000-000000000001'::uuid,'vale_parana','admin_unidade'),
 ('10000000-0000-4000-8000-000000000002'::uuid,'nova_londrina','admin_unidade'),
 ('10000000-0000-4000-8000-000000000003'::uuid,'jussara','admin_unidade'),
 ('10000000-0000-4000-8000-000000000004'::uuid,null,'gestor_central')
) v(user_id,codigo,perfil)
left join public.unidades u on u.codigo = v.codigo
on conflict (user_id) do nothing;

insert into public.ordens_servico (unidade_id,numero_os,frota,entrada,descricao,setor,status,sequencia)
select u.id, x.numero_os, x.frota, x.entrada, x.descricao, x.setor, x.status, x.sequencia
from (values
 ('vale_parana','TESTE-VP-001','FROTA-TESTE-01','20/10/2026','Revisão preventiva demonstrativa','Oficina','pendente',1),
 ('vale_parana','TESTE-VP-002','FROTA-TESTE-02','19/10/2026','Verificação elétrica demonstrativa','Elétrica','em_andamento',2),
 ('nova_londrina','TESTE-NL-001','FROTA-TESTE-11','20/10/2026','Inspeção demonstrativa','Oficina','pendente',1),
 ('nova_londrina','TESTE-NL-002','FROTA-TESTE-12','18/10/2026','Ajuste demonstrativo','Mecânica','concluida',2),
 ('jussara','TESTE-JU-001','FROTA-TESTE-21','17/10/2026','Diagnóstico demonstrativo','Elétrica','pendente',1),
 ('jussara','TESTE-JU-002','FROTA-TESTE-22','16/10/2026','Manutenção demonstrativa','Oficina','em_andamento',2)
) x(codigo,numero_os,frota,entrada,descricao,setor,status,sequencia)
join public.unidades u on u.codigo=x.codigo
where not exists (select 1 from public.ordens_servico os where os.numero_os=x.numero_os);
