create or replace function public.record_organization_product_access_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment public.organization_product_access_assignments;
  assignment_action text;
begin
  if tg_op = 'DELETE' then
    assignment := old;
    assignment_action := 'revoked';
  elsif tg_op = 'INSERT' then
    assignment := new;
    assignment_action := case when new.is_active then 'assigned' else 'revoked' end;
  else
    assignment := new;
    if old.is_active is distinct from new.is_active then
      assignment_action := case when new.is_active then 'assigned' else 'revoked' end;
    else
      return new;
    end if;
  end if;

  insert into public.organization_product_access_audit (org_id, user_id, product_slug, action, actor_id)
  values (assignment.org_id, assignment.user_id, assignment.product_slug, assignment_action, auth.uid());

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    assignment.org_id,
    auth.uid(),
    assignment_action,
    'product_access',
    assignment.user_id,
    jsonb_build_object(
      'module', 'Product Access',
      'description', format('Product access %s for member %s.', assignment_action, assignment.user_id),
      'product_slug', assignment.product_slug,
      'user_id', assignment.user_id
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
