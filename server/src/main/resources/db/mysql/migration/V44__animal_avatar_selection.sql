alter table memberships
  drop check memberships_avatar_key_check;

update memberships
join (
  select
    ranked_memberships.id,
    avatar_keys.avatar_key
  from (
    select
      id,
      row_number() over (
        partition by club_id
        order by
          case when status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED') then 0 else 1 end,
          sha2(concat(club_id, ':', id, ':animal-avatar-v1'), 256),
          id
      ) as avatar_rank
    from memberships
  ) ranked_memberships
  join json_table(
    '["hedgehog-green-book","squirrel-acorn","deer-brown-book","fox-glasses-mug","koala-book-sprig","polar-bear-snowflake-mug","penguin-beret-book","cat-flower-mug","alpaca-winter-sprig","squirrel-green-book","penguin-orange-mug","panda-green-book","mouse-blue-book","turtle-winter-book","ladybug-green-book","snail-green-book","sloth-orange-mug","alpaca-brown-book","fennec-heart-mug","hedgehog-glasses-book","squirrel-autumn-book","penguin-heart-mug","deer-plaid-book","alpaca-heart-mug","turtle-glasses-book","owl-beret-book","bear-green-book","rabbit-brown-book","cat-heart-mug","dog-green-book","chick-beret-book","duck-green-mug","hamster-green-book","red-panda-orange-mug","sheep-brown-book","fox-side-book","winter-bird","mallard-orange-mug","owl-glasses-book","hedgehog-green-mug"]',
    '$[*]' columns (
      avatar_index for ordinality,
      avatar_key varchar(40) path '$'
    )
  ) avatar_keys on avatar_keys.avatar_index = mod(ranked_memberships.avatar_rank - 1, 40) + 1
) assigned_avatars on assigned_avatars.id = memberships.id
set memberships.avatar_key = assigned_avatars.avatar_key;

alter table memberships
  add constraint memberships_avatar_key_check check (
    avatar_key in (
      'hedgehog-green-book',
      'squirrel-acorn',
      'deer-brown-book',
      'fox-glasses-mug',
      'koala-book-sprig',
      'polar-bear-snowflake-mug',
      'penguin-beret-book',
      'cat-flower-mug',
      'alpaca-winter-sprig',
      'squirrel-green-book',
      'penguin-orange-mug',
      'panda-green-book',
      'mouse-blue-book',
      'turtle-winter-book',
      'ladybug-green-book',
      'snail-green-book',
      'sloth-orange-mug',
      'alpaca-brown-book',
      'fennec-heart-mug',
      'hedgehog-glasses-book',
      'squirrel-autumn-book',
      'penguin-heart-mug',
      'deer-plaid-book',
      'alpaca-heart-mug',
      'turtle-glasses-book',
      'owl-beret-book',
      'bear-green-book',
      'rabbit-brown-book',
      'cat-heart-mug',
      'dog-green-book',
      'chick-beret-book',
      'duck-green-mug',
      'hamster-green-book',
      'red-panda-orange-mug',
      'sheep-brown-book',
      'fox-side-book',
      'winter-bird',
      'mallard-orange-mug',
      'owl-glasses-book',
      'hedgehog-green-mug'
    )
  );
