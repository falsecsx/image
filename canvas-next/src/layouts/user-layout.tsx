import { Outlet } from "react-router-dom";

export default function UserLayout() {
    return <div className="h-dvh overflow-hidden bg-background text-foreground"><Outlet /></div>;
}
