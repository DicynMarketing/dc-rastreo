-- Notificaciones push de la app del cliente.
-- La llave privada VAPID va en Vault con el nombre 'vapid_private' (se crea aparte; NUNCA en el código).
create table if not exists public.push_subs(
  endpoint text primary key,
  registro text not null references public.registros(id) on delete cascade,
  p256dh text not null, auth text not null, lang text default 'es',
  creado timestamptz default now());
alter table public.push_subs enable row level security;
create table if not exists public.push_log(pedido text primary key, i int not null, f timestamptz default now());
alter table public.push_log enable row level security;

create or replace function public.push_vapid() returns text language sql security definer set search_path='' as
$$ select decrypted_secret from vault.decrypted_secrets where name='vapid_private' limit 1 $$;
revoke all on function public.push_vapid() from public, anon, authenticated;
grant execute on function public.push_vapid() to service_role;

create or replace function public.app_push(p_id text, p_token text, p_sub jsonb, p_on boolean, p_lang text default 'es')
returns boolean language plpgsql security definer set search_path='public' as $$
begin
  if not exists(select 1 from public.registros where id=p_id and token=p_token) then return false; end if;
  if p_sub is null or coalesce(p_sub->>'endpoint','') !~ '^https://' then return false; end if;
  if p_on then
    insert into public.push_subs(endpoint,registro,p256dh,auth,lang)
    values(p_sub->>'endpoint',p_id,p_sub->'keys'->>'p256dh',p_sub->'keys'->>'auth',coalesce(nullif(p_lang,''),'es'))
    on conflict(endpoint) do update set registro=excluded.registro,p256dh=excluded.p256dh,auth=excluded.auth,lang=excluded.lang;
  else
    delete from public.push_subs where endpoint=p_sub->>'endpoint' and registro=p_id;
  end if;
  return true;
end $$;
revoke all on function public.app_push(text,text,jsonb,boolean,text) from public;
grant execute on function public.app_push(text,text,jsonb,boolean,text) to anon, authenticated;

create or replace function public.push_al_cambiar() returns trigger language plpgsql security definer set search_path='public' as $$
begin
  if new.vista is not null and new.cliente is not null
     and (tg_op='INSERT' or (old.vista->>'i') is distinct from (new.vista->>'i'))
     and exists(select 1 from public.push_subs s join public.registros r on r.id=s.registro where r.cliente=new.cliente) then
    perform net.http_post(url:='https://jmfyzohwffylzrwkbtwl.supabase.co/functions/v1/avisar-push',
      body:=jsonb_build_object('id',new.id), headers:='{"Content-Type":"application/json"}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists push_al_cambiar on public.pedidos;
create trigger push_al_cambiar after insert or update of vista on public.pedidos for each row execute function public.push_al_cambiar();
