-- Fail closed for missing catalog configuration and unknown product IDs.
create or replace function public.wallet_order_section(items jsonb, cfg jsonb)
returns text
language plpgsql stable
set search_path to 'public'
as $$
declare
  it jsonb;
  product jsonb;
  section_name text;
begin
  if items is null or jsonb_typeof(items) <> 'array' then return null; end if;
  if jsonb_array_length(items) < 1 or jsonb_array_length(items) > 50 then return null; end if;
  if cfg is null or coalesce(jsonb_typeof(cfg->'products'), 'null') <> 'array' then return null; end if;

  for it in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(it) <> 'object' or nullif(btrim(it->>'id'), '') is null then
      return null;
    end if;
    product := null;
    select x into product
    from jsonb_array_elements(cfg->'products') x
    where x->>'id' = it->>'id'
    limit 1;
    section_name := public.wallet_item_section(product, cfg);
    if section_name is distinct from 'main' then return null; end if;
  end loop;
  return 'main';
end;
$$;

create or replace function public.wallet_eligible(p_items jsonb)
returns boolean
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  cfg jsonb;
  item jsonb;
  item_count integer;
  section_name text;
begin
  if auth.uid() is null then return false; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return false; end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 50 then return false; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) <> 'object'
       or nullif(btrim(item->>'id'), '') is null then
      return false;
    end if;
  end loop;

  select data into cfg from public.store_config where id = 1;
  if cfg is null or coalesce(cfg->'wallet'->>'on', 'true') = 'false' then
    return false;
  end if;

  section_name := public.wallet_order_section(p_items, cfg);
  return coalesce(section_name = any(public.wallet_sections(cfg)), false);
end;
$$;
