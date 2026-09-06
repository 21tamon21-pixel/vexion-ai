import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Chat from "@/pages/Chat";
import Login from "@/pages/Login";
import Settings from "@/pages/Settings";
import Projects from "@/pages/Projects";
import Usage from "@/pages/Usage";
import Plugins from "@/pages/Plugins";
import PluginConnect from "@/pages/PluginConnect";
import Billing from "@/pages/Billing";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/usage" element={<Usage />} />
        <Route path="/plugins" element={<Plugins />} />
        <Route path="/plugins/:pluginId/connect" element={<PluginConnect />} />
        <Route path="/billing" element={<Billing />} />
      </Routes>
      <Toaster position="top-right" richColors theme="light" />
    </>
  );
}
