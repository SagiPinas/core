
create table users (
  user_id text PRIMARY KEY,
  name text,
  email text,
  password text,
    UNIQUE(user_id)
);

create table incidents (
  incident_id text PRIMARY KEY,
  reportee_id varchar(100) default null,
  rescuer_id text default null,
  verifiers text default null,
  type varchar(50) default null,
  description text default null,
  specified text default null,
  status text default null,
  location text default null,
  date_reported text default null,
  date_processed text default null,
  process_comments text default null,
   UNIQUE(incident_id)
);


