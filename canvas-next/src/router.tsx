import { createHashRouter, Navigate } from "react-router-dom";
import UserLayout from "@/layouts/user-layout";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";

export const router = createHashRouter([
    {
        element: <UserLayout />,
        children: [
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "*", element: <Navigate to="/canvas" replace /> },
        ],
    },
]);
