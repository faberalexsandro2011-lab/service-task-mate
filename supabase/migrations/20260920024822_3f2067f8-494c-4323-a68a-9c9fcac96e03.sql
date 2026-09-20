-- Roles enum
CREATE TYPE public.app_role AS ENUM ('gestor', 'tecnico');

-- Timestamp helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- ORDENS DE SERVICO
CREATE TABLE public.ordens_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os TEXT NOT NULL,
  frota TEXT NOT NULL,
  localizacao TEXT,
  descricao TEXT,
  tecnico_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tecnico_email TEXT,
  status TEXT NOT NULL DEFAULT 'ativa',
  notas_fecho TEXT,
  criado_por_email TEXT,
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_servico TO authenticated;
GRANT ALL ON public.ordens_servico TO service_role;
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;

-- HISTORICO
CREATE TABLE public.historico_edicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  detalhe TEXT,
  usuario_id UUID,
  usuario_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.historico_edicoes TO authenticated;
GRANT ALL ON public.historico_edicoes TO service_role;
ALTER TABLE public.historico_edicoes ENABLE ROW LEVEL SECURITY;

-- POLICIES: profiles
CREATE POLICY "Ver o proprio perfil" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Atualizar o proprio perfil" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Inserir o proprio perfil" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- POLICIES: user_roles
CREATE POLICY "Ver funcoes" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor'));

-- POLICIES: ordens_servico
CREATE POLICY "Gestores gerem todas as OS" ON public.ordens_servico FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Tecnicos veem as suas OS" ON public.ordens_servico FOR SELECT TO authenticated
  USING (tecnico_id = auth.uid());
CREATE POLICY "Tecnicos fecham as suas OS" ON public.ordens_servico FOR UPDATE TO authenticated
  USING (tecnico_id = auth.uid()) WITH CHECK (tecnico_id = auth.uid());

-- POLICIES: historico
CREATE POLICY "Ver historico permitido" ON public.historico_edicoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor')
    OR EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id AND o.tecnico_id = auth.uid())
  );
CREATE POLICY "Registar historico" ON public.historico_edicoes FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid() AND (
      public.has_role(auth.uid(), 'gestor')
      OR EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id AND o.tecnico_id = auth.uid())
    )
  );

-- Triggers
CREATE TRIGGER update_ordens_servico_updated_at BEFORE UPDATE ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- New user -> profile + default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data ->> 'role')::public.app_role, 'tecnico'))
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes
CREATE INDEX idx_os_tecnico ON public.ordens_servico(tecnico_id);
CREATE INDEX idx_os_status ON public.ordens_servico(status);
CREATE INDEX idx_hist_os ON public.historico_edicoes(os_id);

-- Realtime
ALTER TABLE public.ordens_servico REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ordens_servico;