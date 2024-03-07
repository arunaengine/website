
export default defineNuxtRouteMiddleware((to, from) => {
    console.log("Called check-access middleware")
    if (process.server) { return }

    const oidc = useOidc()
    if (!oidc.isLoggedIn) {
        console.log("User is not logged in. Redirecting to login.")
        oidc.login(to.fullPath)
    }

    return
})
