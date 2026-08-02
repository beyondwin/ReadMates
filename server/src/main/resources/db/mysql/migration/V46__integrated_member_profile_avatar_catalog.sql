alter table memberships drop check memberships_avatar_key_check;

update memberships
join (
  select ranked_memberships.id, avatar_keys.avatar_key
  from (
    select
      id,
      row_number() over (
        partition by club_id
        order by
          case when status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED') then 0 else 1 end,
          sha2(concat(club_id, ':', id, ':integrated-avatar-v2'), 256),
          id
      ) as avatar_rank
    from memberships
  ) ranked_memberships
  join json_table(
    '["globe-notebook","mushroom-green-book","lemon-green-book","pudding-notebook","peach-green-book","radish-notebook","apple-green-book","sailboat-green-book","palette-green-book","balloon-green-book","dumpling-notebook","tulip-notebook","cheese-green-book","starfish-notebook","banana-green-book","milk-green-book","cloud-green-book","teacup-green-book","toast-brown-book","snowglobe-green-book","cherries-notebook","envelope-notebook","bell-notebook","teacup-notebook","candle-green-book","sun-green-book","teapot-green-book","sheep-notebook","moon-green-book","star-notebook"]',
    '$[*]' columns (
      avatar_ordinal for ordinality,
      avatar_key varchar(64) path '$'
    )
  ) avatar_keys on avatar_keys.avatar_ordinal = mod(ranked_memberships.avatar_rank - 1, 30) + 1
) assignments on assignments.id = memberships.id
set memberships.avatar_key = assignments.avatar_key;

alter table memberships
  add constraint memberships_avatar_key_check check (avatar_key in (
      'globe-notebook',
      'mushroom-green-book',
      'lemon-green-book',
      'pudding-notebook',
      'peach-green-book',
      'radish-notebook',
      'apple-green-book',
      'sailboat-green-book',
      'palette-green-book',
      'balloon-green-book',
      'dumpling-notebook',
      'tulip-notebook',
      'cheese-green-book',
      'starfish-notebook',
      'banana-green-book',
      'milk-green-book',
      'cloud-green-book',
      'teacup-green-book',
      'toast-brown-book',
      'snowglobe-green-book',
      'cherries-notebook',
      'envelope-notebook',
      'bell-notebook',
      'teacup-notebook',
      'candle-green-book',
      'sun-green-book',
      'teapot-green-book',
      'sheep-notebook',
      'moon-green-book',
      'star-notebook'
  ));
