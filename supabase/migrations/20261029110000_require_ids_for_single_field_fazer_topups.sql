-- Require a single account identifier for verified FazerCards direct top-ups.
-- Categories that need multiple independent fields are intentionally excluded until the provider payload supports them.
WITH req_map(category_id, req_key) AS (
  VALUES
  ('age_of_magic','user_id'),
  ('devil_may_cry_peak_of_combat','player_id'),
  ('dragonheir_silent_gods','player_id'),
  ('bullet_echo','player_id'),
  ('cats_crash_arena_turbo_stars','user_id'),
  ('bleach_soul_resonance_sea','user_id'),
  ('dazz_live','user_id'),
  ('bleach_soul_resonance_americas','user_id'),
  ('bleach_soul_resonance_europe','user_id'),
  ('dream_and_lethe_record','role_id'),
  ('crossfire_legend','user_id'),
  ('crystal_of_atlan','user_id'),
  ('dragon_raja_sea','player_id'),
  ('acecraft','user_id'),
  ('black_clover_m','player_id'),
  ('8_ball_pool','unique_id'),
  ('arena_of_valor_id','user_id'),
  ('afk_journey','account_id'),
  ('captain_tsubasa_ace','user_id'),
  ('codm_activision_in','user_id'),
  ('crossout_mobile','user_id'),
  ('ballistic_hero_vng','role_id'),
  ('civilization_eras_and_allies','user_id'),
  ('crystalfall','user_id'),
  ('blade_x_odyssey_of_heroes','player_id'),
  ('chamet','user_id'),
  ('clash_of_plants','role_id'),
  ('arena_of_valor_eu','user_id'),
  ('capcut','user_id')
)
UPDATE public.store_config AS sc
SET data=jsonb_set(
  sc.data,
  '{products}',
  (
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN p->>'smm_provider'='fazer' AND m.req_key IS NOT NULL
          THEN p || jsonb_build_object('smm_input','text','req',jsonb_build_array(m.req_key))
        ELSE p
      END ORDER BY ord
    ),'[]'::jsonb)
    FROM jsonb_array_elements(sc.data->'products') WITH ORDINALITY AS x(p,ord)
    LEFT JOIN req_map m ON p->>'smm_country'=m.category_id
  ),
  true
),
updated_at=now()
WHERE sc.id=1;
