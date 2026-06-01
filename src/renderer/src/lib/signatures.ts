export type SignatureType = 'signature' | 'initials'

export interface SavedSignature {
  id: string
  type: SignatureType
  name: string
  createdAt: string
  dataUrl: string
}

export const MAX_PER_TYPE = 10

export const typeLabel = (type: SignatureType): string =>
  type === 'initials' ? 'initials' : 'signature'
