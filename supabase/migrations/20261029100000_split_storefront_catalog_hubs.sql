-- Split the storefront into separate game, chat/live, AI and general-app hubs.
-- Existing product IDs and order references remain unchanged.
UPDATE public.store_config
SET data = jsonb_set(
  jsonb_set(
    data,
    '{categories}',
    (
      SELECT
        coalesce(jsonb_agg(
          CASE
            WHEN c->>'id' IN ('cmvpwlz559mg','cmvpwlz5jak3','cmvpwlz5nx9d')
              THEN jsonb_set(c,'{hub}','"chat"'::jsonb,true)
            WHEN c->>'id'='cmvpwlz5hziq'
              THEN jsonb_set(c,'{hub}','"apps"'::jsonb,true)
            WHEN c->>'id'='hub_apps'
              THEN c || jsonb_build_object('ar','التطبيقات والبطاقات الرقمية','en','Apps & Digital Cards',
                'da','اشتراكات التطبيقات والبطاقات الرقمية وأدوات الإبداع',
                'de','App subscriptions, digital cards and creative tools')
            ELSE c
          END ORDER BY ord
        ),'[]'::jsonb)
        ||
        CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(data->'categories') AS q(x) WHERE x->>'id'='hub_chat')
          THEN jsonb_build_array(jsonb_build_object('id','hub_chat','ty','hub','i','users',
            'ar','تطبيقات الدردشة والبث','en','Chat & Live Apps',
            'da','اشحن عملات تطبيقات البث والدردشة مع إدخال معرّف الحساب المطلوب',
            'de','Top up live and chat app coins using the required account ID','f',jsonb_build_array(),'image_url',''))
          ELSE '[]'::jsonb END
        ||
        CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(data->'categories') AS q(x) WHERE x->>'id'='hub_ai')
          THEN jsonb_build_array(jsonb_build_object('id','hub_ai','ty','hub','i','spark',
            'ar','اشتراكات الذكاء الاصطناعي','en','AI Subscriptions',
            'da','اشتراكات أدوات الذكاء الاصطناعي وخططها — ستظهر الباقات المتاحة فقط',
            'de','AI tools and subscription plans — only verified available packages are listed','f',jsonb_build_array(),'image_url',''))
          ELSE '[]'::jsonb END
        ||
        CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(data->'categories') AS q(x) WHERE x->>'id'='ai-subscriptions')
          THEN jsonb_build_array(jsonb_build_object('id','ai-subscriptions','ty','shop','hub','ai','i','spark',
            'ar','اشتراكات الذكاء الاصطناعي','en','AI Subscriptions',
            'da','اختر خدمة الذكاء الاصطناعي وخطة الاشتراك المناسبة',
            'de','Choose an AI service and subscription plan','f',jsonb_build_array(),'image_url',''))
          ELSE '[]'::jsonb END
      FROM jsonb_array_elements(data->'categories') WITH ORDINALITY AS x(c,ord)
    ),
    true
  ),
  '{products}',
  (
    SELECT coalesce(jsonb_agg(
      CASE WHEN p->>'c'='cmvpwlz5nx9d'
        THEN jsonb_set(jsonb_set(p,'{smm_input}','"text"'::jsonb,true),'{req}','["player_id"]'::jsonb,true)
        ELSE p
      END ORDER BY ord
    ),'[]'::jsonb)
    FROM jsonb_array_elements(data->'products') WITH ORDINALITY AS x(p,ord)
  ),
  true
),
updated_at=now()
WHERE id=1;
