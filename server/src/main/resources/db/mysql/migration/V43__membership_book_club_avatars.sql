alter table memberships
  add column avatar_key varchar(40) character set ascii collate ascii_bin null;

update memberships
join (
  select
    ranked_memberships.id,
    case mod(ranked_memberships.avatar_rank - 1, 20)
      when 0 then 'reading-lamp'
      when 1 then 'open-book-pencil'
      when 2 then 'book-spines'
      when 3 then 'bookmark-page'
      when 4 then 'notebook-pen'
      when 5 then 'library-stamp'
      when 6 then 'books-glasses'
      when 7 then 'index-cards'
      when 8 then 'archive-box'
      when 9 then 'round-table-books'
      when 10 then 'paired-bookmarks'
      when 11 then 'book-dialogue'
      when 12 then 'question-card'
      when 13 then 'calendar-book'
      when 14 then 'feedback-sheet'
      when 15 then 'reading-notes'
      when 16 then 'banded-book'
      when 17 then 'desk-clock-book'
      when 18 then 'book-tote'
      when 19 then 'discussion-circle'
    end as avatar_key
  from (
    select
      id,
      row_number() over (
        partition by club_id
        order by
          case when status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED') then 0 else 1 end,
          created_at,
          id
      ) as avatar_rank
    from memberships
  ) ranked_memberships
) assigned_avatars on assigned_avatars.id = memberships.id
set memberships.avatar_key = assigned_avatars.avatar_key;

alter table memberships
  modify column avatar_key varchar(40) character set ascii collate ascii_bin not null;

alter table memberships
  add constraint memberships_avatar_key_check check (
    avatar_key in (
      'reading-lamp',
      'open-book-pencil',
      'book-spines',
      'bookmark-page',
      'notebook-pen',
      'library-stamp',
      'books-glasses',
      'index-cards',
      'archive-box',
      'round-table-books',
      'paired-bookmarks',
      'book-dialogue',
      'question-card',
      'calendar-book',
      'feedback-sheet',
      'reading-notes',
      'banded-book',
      'desk-clock-book',
      'book-tote',
      'discussion-circle'
    )
  );

create index memberships_club_status_avatar_idx
  on memberships (club_id, status, avatar_key);
