-- clic3d (27/10/2026) : les buckets n'étaient déclarés que dans config.toml,
-- qui ne s'applique qu'en local ; le projet hébergé n'en avait aucun. Effets :
-- les rendus des modèles n'arrivaient jamais à l'IA (pas d'auto-contrôle) et
-- les photos jointes par les clients échouaient. Les règles d'accès
-- (storage_policies.sql) existaient déjà.
insert into storage.buckets (id, name, public)
values ('images', 'images', false),
       ('meshes', 'meshes', false),
       ('previews', 'previews', false)
on conflict (id) do nothing;
