import type { Schema } from '~/db/schema'
import { createZero } from 'zero-vue'

export const { useZero, useQuery } = createZero<Schema>()
