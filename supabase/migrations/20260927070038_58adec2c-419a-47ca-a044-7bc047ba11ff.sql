revoke execute on function public.generate_student_id() from anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from anon;
-- has_role must stay callable by authenticated: RLS policies execute as the querying user.