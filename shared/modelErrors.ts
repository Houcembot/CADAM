// Keep provider diagnostics in server logs; generation credits are charged only after success.
export function userFacingModelError(_error: unknown): string {
  return 'Service de génération momentanément indisponible. Aucun token n’a été débité. Réessayez dans quelques minutes.';
}
