export {default} from "next-auth/middleware";

export const config={
    matcher:["/admin/((?!login).","/api/admin/:path*"],

};


