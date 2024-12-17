import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as dotenv from "dotenv";

const prisma = new PrismaClient();


export const getUsers = async (req, res) => {
  try {
    const Users = await prisma.users.findMany({
      select: {
        user_id: true,
        username: true,
        password: true,
        email: true,
      },
    });
    res.json(Users);
  } catch (error) {
    console.log(error);
  }
};

export const Register = async (req, res) => {
  const { email, password, username } = req.body;

  let user = await prisma.users.findUnique({ where: { email } });
  if (user) {
    return res.status(400).json({ msg: "Email sudah terdaftar" });
  }

  const salt = await bcrypt.genSalt();
  const hashPassword = await bcrypt.hash(password, salt);

  user = await prisma.users.create({
    data: {
      username,
      email,
      password: hashPassword,
    },
  });
  return res.json({ msg: "Registrasi Berhasil" });
};

export const Login = async (req, res) => {
  let user = await prisma.users.findUnique({
    where: {
      email: req.body.email,
    },
  });

  if (!user) {
    return res.status(404).json({ msg: "Email tidak ditemukan" });
  }

  const check = await bcrypt.compare(req.body.password, user.password);
  if (!check) {
    return res.status(400).json({ msg: "Password salah" });
  }

  const userId = user.user_id;
  const name = user.username;
  const email = user.email;
  const role = user.role;

  const token = jwt.sign(
    { sub: userId, name, email, role },
    process.env.ACCECS_TOKEN_SECRET,
    {
      expiresIn: "720h",
    },
  );
  const refreshToken = jwt.sign(
    { sub: userId, name, email, role },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "1d",
    },
  );

  await prisma.users.update({
    where: {
      user_id: userId,
    },
    data: {
      refresh_token: refreshToken,
    },
  });

  return res.json({ token });
};

export const Logout = async (req, res) => { 
  try {
    const refreshToken =
      req.headers["authorization"]?.split(" ")[1] || req.body.refresh_token;

    if (!refreshToken) {
      return res.status(204); // No refresh token provided, return success (204 No Content)
    }

    const userId = req.user.user_id;

    await prisma.$transaction(async (prisma) => {
      await prisma.users.update({
        where: {
          user_id: userId,
        },
        data: {
          refresh_token: null,
        },
      });
    });

    return res.status(200).json({ msg: "Berhasil Logout" }); // Logout successful, return success (204 No Content)
  } catch (error) {
    console.error("Error during logout:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
