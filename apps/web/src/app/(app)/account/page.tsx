import { redirect } from 'next/navigation';

/** /account has no content of its own — land on the Profile section. */
export default function AccountPage(): never {
  redirect('/account/profile');
}
