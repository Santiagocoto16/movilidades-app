-- Tabla de entradas de conocimiento
create table knowledge_entries (
  id uuid default gen_random_uuid() primary key,
  country text not null,
  category text not null,
  content text not null,
  source text default 'manual',
  author text default 'Equipo',
  expiry_date date,
  created_at timestamp with time zone default timezone('utc', now())
);

-- Tabla de historial de consultas
create table chat_history (
  id uuid default gen_random_uuid() primary key,
  type text not null default 'free',
  question text,
  answer text not null,
  case_data jsonb,
  created_at timestamp with time zone default timezone('utc', now())
);

-- Acceso público (sin login por ahora)
alter table knowledge_entries enable row level security;
alter table chat_history enable row level security;

create policy "Public read/write knowledge_entries"
  on knowledge_entries for all using (true) with check (true);

create policy "Public read/write chat_history"
  on chat_history for all using (true) with check (true);
