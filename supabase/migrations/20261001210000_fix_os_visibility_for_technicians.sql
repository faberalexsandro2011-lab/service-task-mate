-- Permite que o técnico visualize OS atribuídas pelo ID ou pelo e-mail.
-- O ID continua sendo a forma principal de atribuição; o e-mail cobre OS
-- antigas/importadas que não tenham tecnico_id preenchido corretamente.
CREATE POLICY "Tecnicos veem OS pelo email atribuido"
ON public.ordens_servico
FOR SELECT
TO authenticated
USING (
  tecnico_email = (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()))
  AND public.has_role((SELECT auth.uid()), 'tecnico')
);

-- Permite iniciar/finalizar uma OS quando a atribuição existente estiver
-- registrada pelo e-mail, mantendo a exigência de que o usuário seja técnico.
CREATE POLICY "Tecnicos atualizam OS pelo email atribuido"
ON public.ordens_servico
FOR UPDATE
TO authenticated
USING (
  tecnico_email = (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()))
  AND public.has_role((SELECT auth.uid()), 'tecnico')
)
WITH CHECK (
  tecnico_email = (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()))
  AND public.has_role((SELECT auth.uid()), 'tecnico')
);
