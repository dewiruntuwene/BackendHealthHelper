import Express from "express";
const router = Express.Router();
import {
  Register,
  Login,
  getUsers,
  Logout,
} from "../controllers/UserController.js";
import { verifyToken } from "../middleware/VerifyToken.js";

router.get("/users", verifyToken, getUsers);
router.post("/login", Login);
router.post("/register", Register);
router.delete("/logout", verifyToken, Logout);

router.post("/verify-token", verifyToken);

export default router;
