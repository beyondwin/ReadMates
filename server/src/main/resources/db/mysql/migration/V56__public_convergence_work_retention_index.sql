alter table public_convergence_work
  add key public_convergence_work_retention_idx (created_at, convergence_id, lease_expires_at);
