-- Garante que o técnico consiga ler/atualizar o próprio perfil e
-- visualizar/atualizar OS atribuídas pelo ID OU pelo e-mail.
-- As políticas têm nomes próprios para não depender das políticas anteriores.

CREATE POLICY "Tecnicos leem proprio perfil central_os"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Tecnicos inserem proprio perfil central_os"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "Tecnicos atualizam proprio perfil central_os"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "Usuarios leem proprio papel central_os"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Tecnicos veem OS por ID ou email central_os"
ON public.ordens_servico
FOR SELECT
TO authenticated
USING (
  (
    tecnico_id = auth.uid()
    OR lower(coalesce(tecnico_email, '')) = lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
  )
  AND public.has_role(auth.uid(), 'tecnico')
);

CREATE POLICY "Tecnicos atualizam OS por ID ou email central_os"
ON public.ordens_servico
FOR UPDATE
TO authenticated
USING (
  (
    tecnico_id = auth.uid()
    OR lower(coalesce(tecnico_email, '')) = lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
  )
  AND public.has_role(auth.uid(), 'tecnico')
)
WITH CHECK (
  (
    tecnico_id = auth.uid()
    OR lower(coalesce(tecnico_email, '')) = lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
  )
  AND public.has_role(auth.uid(), 'tecnico')
);
