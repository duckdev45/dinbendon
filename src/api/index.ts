import { createDemoApi } from './demo'
import { createGasApi } from './gas'

const url = import.meta.env.VITE_GAS_URL as string | undefined

export const api = url ? createGasApi(url) : createDemoApi()
