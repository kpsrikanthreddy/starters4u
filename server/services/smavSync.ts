import { randomBytes } from 'node:crypto';
/** Server-only SMAV provisioning. Never import from browser code. */
const base = () => (process.env.SMAV_SUPABASE_URL || '').replace(/\/$/, '');
const key = () => process.env.SMAV_SERVICE_ROLE_KEY || '';
export type SyncStaff = { sourceId: string; username?: string; email: string; name: string; phone?: string; role: string; active: boolean; password?: string };
async function request(path: string, method = 'GET', body?: unknown, extra: Record<string,string> = {}) {
  if (!base() || !key()) throw new Error('SMAV_SUPABASE_URL / SMAV_SERVICE_ROLE_KEY not configured');
  const response = await fetch(`${base()}${path}`, { method, headers: { apikey:key(), Authorization:`Bearer ${key()}`, 'Content-Type':'application/json', ...extra }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  const raw = await response.text(); let result: any; try { result = raw ? JSON.parse(raw) : null; } catch { result = raw; }
  if (!response.ok) throw new Error(`SMAV ${response.status}: ${typeof result === 'object' ? (result?.message || result?.error || JSON.stringify(result)) : result}`);
  return result;
}
const enc = encodeURIComponent;

export const mapSmavRole = (role: string): 'ADMIN' | 'STAFF' =>
  [
    'owner',
    'restaurant_owner',
    'restaurant_admin',
    'super_admin',
    'superadmin',
    'platform_admin',
    'branch_manager',
    'manager',
    'admin',
  ].includes((role || '').trim().toLowerCase())
    ? 'ADMIN'
    : 'STAFF';

const roles = mapSmavRole;

export async function syncSmavStaff(outletCode: 'glossylooks' | 'mozz', staff: SyncStaff) {
  const source = outletCode === 'glossylooks' ? 'glossylooks' : 'mozz';
  if (!staff.sourceId || !staff.email?.includes('@')) throw new Error('SMAV requires source ID and valid email');
  const email = staff.email.trim().toLowerCase();
  const matches = await request(
    `/rest/v1/smav_external_identities?source=eq.${enc(source)}&external_id=eq.${enc(staff.sourceId)}&select=auth_user_id`
  );
  let uid = matches?.[0]?.auth_user_id;
  if (!uid) {
    // An existing central email must be explicitly linked, not silently taken over.
    const existing = await request(`/rest/v1/smav_profiles?email=eq.${enc(email)}&select=id`);
    if (existing?.length) throw new Error('Central email already exists; link account manually before synchronization');
    if (staff.password && staff.password.length < 8) throw new Error('SMAV requires passwords of at least 8 characters');
    const created = await request('/auth/v1/admin/users', 'POST', {
      email,
      email_confirm: true,
      password: staff.password || randomBytes(32).toString('base64url'),
      user_metadata: { full_name: staff.name, source, external_staff_id: staff.sourceId },
    });
    uid = created?.id;
    if (!uid) throw new Error('Supabase Auth did not return a user ID');
  } else {
    // Do not downgrade or alter a central SUPERADMIN account via outlet sync.
    const current = await request(`/rest/v1/smav_profiles?id=eq.${enc(uid)}&select=platform_role,email`);
    if (current?.[0]?.platform_role === 'SUPERADMIN') {
      throw new Error('Refusing to modify central Superadmin account via outlet sync');
    }
    const emailChanged = Boolean(current?.[0]?.email && String(current[0].email).toLowerCase() !== email);
    if (staff.password || emailChanged) {
      if (staff.password && staff.password.length < 8) {
        throw new Error('SMAV requires passwords of at least 8 characters');
      }
      const authUpdate: Record<string, unknown> = {};
      if (staff.password) authUpdate.password = staff.password;
      if (emailChanged) {
        authUpdate.email = email;
        authUpdate.email_confirm = true;
      }
      await request(`/auth/v1/admin/users/${enc(uid)}`, 'PUT', authUpdate);
    }
  }
  // Check SUPERADMIN guard for newly resolved profiles as well.
  const current = await request(`/rest/v1/smav_profiles?id=eq.${enc(uid)}&select=platform_role`);
  if (current?.[0]?.platform_role === 'SUPERADMIN') {
    throw new Error('Refusing to modify central Superadmin account via outlet sync');
  }
  const platformRole = roles(staff.role);
  await request(
    '/rest/v1/smav_profiles?on_conflict=id',
    'POST',
    {
      id: uid,
      email,
      full_name: staff.name,
      platform_role: platformRole,
      is_active: staff.active,
    },
    { Prefer: 'resolution=merge-duplicates,return=minimal' }
  );
  const outlets = await request(`/rest/v1/smav_outlets?outlet_code=eq.${enc(outletCode)}&select=id`);
  const outletId = outlets?.[0]?.id;
  if (!outletId) throw new Error(`SMAV outlet ${outletCode} is not registered`);
  await request(
    '/rest/v1/smav_user_outlet_roles?on_conflict=user_id,outlet_id',
    'POST',
    {
      user_id: uid,
      outlet_id: outletId,
      role: roles(staff.role),
      is_active: staff.active,
      external_staff_id: staff.sourceId,
      business_source: source,
    },
    { Prefer: 'resolution=merge-duplicates,return=minimal' }
  );
  await request(
    '/rest/v1/smav_external_identities?on_conflict=source,external_id',
    'POST',
    {
      source,
      external_id: staff.sourceId,
      auth_user_id: uid,
      username: staff.username || null,
      email,
    },
    { Prefer: 'resolution=merge-duplicates,return=minimal' }
  );
  return { synced: true, userId: uid, outletCode };
}
