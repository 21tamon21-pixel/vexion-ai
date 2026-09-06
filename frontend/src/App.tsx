import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Chat from "@/pages/Chat";
import Login from "@/pages/Login";
import Settings from "@/pages/Settings";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <Toaster position="top-right" richColors theme="dark" />
    </>
  );
}
