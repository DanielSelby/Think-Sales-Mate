insert into public.platform_product_features (product_slug, module, is_product_entitling_feature)
values ('think-education', 'Audit & Activity', false)
on conflict (product_slug, module) do nothing;
