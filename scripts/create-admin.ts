import bcrypt  from "bcryptjs";
import {prisma} from "../lib/prisma";

async function main() {
    const email = process.argv[2];
    const password  = process.argv[3];
    if(!email || !password){
        console.error("Usage: tsx script/create-admin.ts <email> <password>");
        process.exit();
    }
    const hashed = await bcrypt.hash(password,10);
    const user = await prisma.user.upsert({
        where: {email},
        update: { password:hashed, role: "ADMIN"},
        create: { email, password: hashed, role: "ADMIN"},
    });
    console.log("Admin created:", user.email);
}
main().finally(()=> prisma.$disconnect());
