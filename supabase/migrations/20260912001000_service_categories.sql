-- Reference data, versioned with the schema so every environment agrees. Adding a
-- category later is one insert in a new migration; nothing else has to change.
insert into public.service_categories (slug, label, tagline, icon, sort_order)
values
  ('ride', 'Ride', 'Get somewhere', 'car-outline', 10),
  ('delivery', 'Delivery', 'Send or collect something', 'cube-outline', 20),
  ('errand', 'Errand', 'Have something run for you', 'bag-handle-outline', 30),
  ('repair', 'Repair', 'Fix something that stopped working', 'construct-outline', 40),
  ('cleaning', 'Cleaning', 'Get a space cleaned', 'sparkles-outline', 50),
  ('other', 'Something else', 'Describe the help you need', 'help-buoy-outline', 60)
on conflict (slug) do update
set label = excluded.label,
    tagline = excluded.tagline,
    icon = excluded.icon,
    sort_order = excluded.sort_order;
