import { redirect } from 'next/navigation'

// The documents index lives with the rest of the private library now.
export default function DocsIndexRedirect() {
  redirect('/workflows/private/e8/')
}
