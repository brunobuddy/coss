import "server-only";
import { type ContactEnvironment, listContactPropertyRows, listTopicRows } from "@coss/email";
import { listAllAudiences } from "@/lib/marketing";

/** What the segment builder offers: properties, audiences and topics of the environment. */
export async function segmentEditorData(env: ContactEnvironment) {
  const [properties, audiences, topics] = await Promise.all([
    listContactPropertyRows(env),
    listAllAudiences(env),
    listTopicRows(env),
  ]);
  return {
    properties: properties.map((property) => ({ key: property.key, type: property.type })),
    audiences: audiences.data.map((audience) => ({ value: audience.id, label: audience.name })),
    topics: topics.map((topic) => ({ value: topic.key, label: topic.name })),
  };
}
