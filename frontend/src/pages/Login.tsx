import {
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "./Login.css";

export default function Login() {
  const navigate =
    useNavigate();

  const [email, setEmail] =
    useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function handleLogin(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response =
        await api.post(
          "/auth/login",
          {
            email,
            password,
          }
        );

      if (
        response.data.success
      ) {
        navigate(
          "/dashboard"
        );
      }
    } catch (error: any) {
      setError(
        error.response?.data
          ?.message ||
          "Unable to login. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="brand-login-page">

      <div className="brand-login-topbar">

        <div className="brand-top-logo">
          <img
            src="/prorich-mark.png"
            alt="Prorich Agro"
          />
        </div>

        <span>
          Delegation Management
        </span>

      </div>

      <div className="brand-login-content">

        <div className="brand-login-card">

          <div className="brand-login-logo">

            <img
              src="/prorich-mark.png"
              alt="Prorich Agro"
            />

          </div>

          <div className="brand-login-heading">

            <h1>
              Delegation Management
            </h1>

          </div>

          <form
            onSubmit={
              handleLogin
            }
          >

            <div className="brand-login-field">

              <label>
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(
                    e.target.value
                  )
                }
                placeholder="Enter your email"
                required
              />

            </div>

            <div className="brand-login-field">

              <label>
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(
                    e.target.value
                  )
                }
                placeholder="Enter your password"
                required
              />

            </div>

            {error && (
              <div className="brand-login-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="brand-login-button"
              disabled={loading}
            >
              {loading
                ? "Signing in..."
                : "Sign In"}
            </button>

          </form>

        </div>

      </div>

    </div>
  );
}