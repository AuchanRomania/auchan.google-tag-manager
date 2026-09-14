export const useRenderSession = () => ({
  loading: false,
  session: {
    namespaces: {
      profile: {
        isAuthenticated: { value: 'false' },
      },
    },
  },
})
