psql -h /var/tmp/farmpg -p 5499 -U postgres -d sb -q -c "truncate public.farm_records, public.farm_invites, public.farm_members, public.farms, auth.users cascade"
