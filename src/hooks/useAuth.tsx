import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeRedirectUri, revokeAsync, startAsync } from "expo-auth-session";
import React, {
  useEffect,
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { generateRandom } from "expo-auth-session/build/PKCE";

import { api } from "../services/api";

interface User {
  id: number;
  display_name: string;
  email: string;
  profile_image_url: string;
}

interface AuthContextData {
  user: User;
  isLoggingOut: boolean;
  isLoggingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthProviderData {
  children: ReactNode;
}

const AuthContext = createContext({} as AuthContextData);

const twitchEndpoints = {
  authorization: "https://id.twitch.tv/oauth2/authorize",
  revocation: "https://id.twitch.tv/oauth2/revoke",
};

function AuthProvider({ children }: AuthProviderData) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, setUser] = useState({} as User);
  const [userToken, setUserToken] = useState("");

  const { CLIENT_ID } = process.env;
  const DB_USER_KEY = process.env.DB_USER_KEY || "@stream.data:user";

  async function signIn() {
    try {
      setIsLoggingIn(true);
      const REDIRECT_URI = makeRedirectUri({ useProxy: true });
      const REDIRECT_TYPE = "token";
      const SCOPE = encodeURI("openid user:read:email user:read:follows");
      const FORCE_VERIFY = true;
      const STATE = generateRandom(30);

      const authUrl =
        twitchEndpoints.authorization +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&response_type=${REDIRECT_TYPE}` +
        `&scope=${SCOPE}` +
        `&force_verify=${FORCE_VERIFY}` +
        `&state=${STATE}`;

      const authResponse = await startAsync({ authUrl });

      if (
        authResponse.type === "success" &&
        authResponse.params.error !== "access_denied"
      ) {
        if (authResponse.params.state !== STATE) {
          throw new Error("Invalid state value");
        }

        const { access_token: accessToken } = authResponse.params;
        api.defaults.headers.authorization = `Bearer ${accessToken}`;
        setUserToken(accessToken);

        const { data } = await api.get("/users");
        const userData = data.data[0];
        setUser(userData);

        await AsyncStorage.setItem(
          DB_USER_KEY,
          JSON.stringify({ user: userData, accessToken })
        );
      }
    } catch (error) {
      throw new Error(error);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function signOut() {
    try {
      setIsLoggingOut(true);

      await revokeAsync(
        { token: userToken, clientId: CLIENT_ID },
        { revocationEndpoint: twitchEndpoints.revocation }
      );

      await AsyncStorage.removeItem(DB_USER_KEY);
    } catch {
    } finally {
      delete api.defaults.headers.authorization;

      setUserToken("");
      setUser({} as User);
      setIsLoggingOut(false);
    }
  }

  async function loadData() {
    try {
      const userResponse = await AsyncStorage.getItem(DB_USER_KEY);

      if (userResponse) {
        const { user, accessToken } = JSON.parse(userResponse);
        api.defaults.headers.authorization = `Bearer ${accessToken}`;

        setUser(user);
        setUserToken(accessToken);
      }
    } catch (error) {
      throw new Error("Invalid User");
    }
  }

  useEffect(() => {
    loadData();
    api.defaults.headers["Client-Id"] = CLIENT_ID;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoggingOut, isLoggingIn, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);

  return context;
}

export { AuthProvider, useAuth };
