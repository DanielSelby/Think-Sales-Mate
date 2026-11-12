insert into public.platform_product_features (product_slug, module, is_product_entitling_feature)
values ('think-education', 'Parent & Guardian Management', false)
on conflict (product_slug, module) do nothing;
