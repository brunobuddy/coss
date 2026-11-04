import type {
  EnvironmentHomeResponse,
  Page,
  SchedulingBooking,
  SchedulingBookingActionResponse,
  SchedulingBookingView,
  SchedulingEventType,
  SchedulingHost,
  SchedulingHostResponse,
  SchedulingSettings,
} from "@coss/companion";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "./auth";
import {
  ApiRequestError,
  apiEnvironmentPath,
  type EnvironmentKey,
  get,
  retry,
  segment,
} from "./queries";

function schedulingPath(key: EnvironmentKey): string {
  return `${apiEnvironmentPath(key)}/scheduling`;
}

export function useEnvironmentHome(key: EnvironmentKey | null) {
  const { api } = useAuth();
  return useQuery({
    queryKey: ["home", key],
    enabled: key !== null,
    queryFn: () =>
      get<EnvironmentHomeResponse>(api, `${apiEnvironmentPath(key as EnvironmentKey)}/home`),
    placeholderData: keepPreviousData,
    retry,
  });
}

export function useSchedulingBookings(
  key: EnvironmentKey,
  options: {
    view: SchedulingBookingView;
    host?: string;
    /** Only this local day: `[start, end)` as instants. */
    day?: { from: string; to: string } | null;
  },
) {
  const { api } = useAuth();
  const { view, host, day } = options;
  return useInfiniteQuery({
    queryKey: ["scheduling", key, "bookings", view, host ?? null, day?.from ?? null],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ view });
      if (host) params.set("host", host);
      if (day) {
        params.set("from", day.from);
        params.set("to", day.to);
      }
      if (pageParam) params.set("after", pageParam);
      return get<Page<SchedulingBooking>>(api, `${schedulingPath(key)}/bookings?${params}`);
    },
    getNextPageParam: (page) => page.next_cursor,
    placeholderData: keepPreviousData,
    retry,
  });
}

export function useSchedulingBooking(key: EnvironmentKey, id: string) {
  const { api } = useAuth();
  return useQuery({
    queryKey: ["scheduling", key, "booking", id],
    queryFn: () => get<SchedulingBooking>(api, `${schedulingPath(key)}/bookings/${segment(id)}`),
    retry,
  });
}

export type BookingAction = "approve" | "decline" | "cancel";

export function useBookingAction(key: EnvironmentKey, id: string) {
  const { api } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (action: BookingAction) => {
      const { data, error } = await api<SchedulingBookingActionResponse>(
        `${schedulingPath(key)}/bookings/${segment(id)}/${action}`,
        { method: "POST" },
      );
      if (error) throw new ApiRequestError(error);
      return data;
    },
    onSuccess: ({ booking }) => {
      client.setQueryData(["scheduling", key, "booking", id], booking);
      void client.invalidateQueries({ queryKey: ["scheduling", key, "bookings"] });
      void client.invalidateQueries({ queryKey: ["home", key] });
    },
  });
}

export function useSchedulingHosts(key: EnvironmentKey) {
  const { api } = useAuth();
  return useInfiniteQuery({
    queryKey: ["scheduling", key, "hosts"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      get<Page<SchedulingHost>>(
        api,
        `${schedulingPath(key)}/hosts${pageParam ? `?after=${segment(pageParam)}` : ""}`,
      ),
    getNextPageParam: (page) => page.next_cursor,
    retry,
  });
}

export function useSchedulingHost(key: EnvironmentKey, id: string) {
  const { api } = useAuth();
  return useQuery({
    queryKey: ["scheduling", key, "host", id],
    queryFn: () => get<SchedulingHostResponse>(api, `${schedulingPath(key)}/hosts/${segment(id)}`),
    retry,
  });
}

export function useSchedulingEventTypes(key: EnvironmentKey) {
  const { api } = useAuth();
  return useInfiniteQuery({
    queryKey: ["scheduling", key, "event-types"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      get<Page<SchedulingEventType>>(
        api,
        `${schedulingPath(key)}/event-types${pageParam ? `?after=${segment(pageParam)}` : ""}`,
      ),
    getNextPageParam: (page) => page.next_cursor,
    retry,
  });
}

export function useSchedulingEventType(key: EnvironmentKey, id: string) {
  const { api } = useAuth();
  return useQuery({
    queryKey: ["scheduling", key, "event-type", id],
    queryFn: () =>
      get<SchedulingEventType>(api, `${schedulingPath(key)}/event-types/${segment(id)}`),
    retry,
  });
}

export function useSchedulingSettings(key: EnvironmentKey) {
  const { api } = useAuth();
  return useQuery({
    queryKey: ["scheduling", key, "settings"],
    queryFn: () => get<SchedulingSettings>(api, `${schedulingPath(key)}/settings`),
    retry,
  });
}
