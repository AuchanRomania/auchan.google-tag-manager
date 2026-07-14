declare module 'vtex.session-client' {
  interface SessionValue {
    value?: string
  }

  export interface Session {
    namespaces?: {
      profile?: {
        isAuthenticated?: SessionValue
        id?: SessionValue
        email?: SessionValue
      }
      authentication?: {
        storeUserEmail?: SessionValue
      }
    }
  }

  export const useRenderSession: () => {
    loading: boolean
    session?: Session
    error?: Error
  }
}
