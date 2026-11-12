insert into public.platform_product_features (product_slug, module, is_product_entitling_feature)
values ('think-education', 'Notifications', false)
on conflict (product_slug, module) do nothing;
