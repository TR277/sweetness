-- Allow clearing anonymous session records from the app
create policy "Anyone can delete anonymous records"
  on public.drink_records for delete
  using (user_id is null);
