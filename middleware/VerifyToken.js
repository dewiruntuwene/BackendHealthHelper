import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  console.log("Authorization Header:", req.headers["authorization"]);
  const token = req.headers["authorization"]?.split(" ")[1];
  console.log("token: ",token)

  if (!token) {
    console.log("No token provided");
    return res.status(403).json({ message: "No token provided" });
  }

  jwt.verify(token, process.env.ACCECS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log("Failed to authenticate token");
      return res.status(401).json({ message: "Failed to authenticate token" });
    }

    console.log("Token verified, decoded:", decoded);
    req.user = {
      user_id: decoded.sub,
      username: decoded.name,
    };
    console.log(req.user);

    next();
  });
};

export default verifyToken;
