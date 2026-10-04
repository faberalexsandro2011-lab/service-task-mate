-- Allow managers to load the team list from the dashboard while keeping
-- technicians restricted to their own profile/role.

create policy "gestors can read all profiles"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.has_role(auth.uid(), 'gestor'));

create policy "gestors can read all user roles"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(), 'gestor'));
