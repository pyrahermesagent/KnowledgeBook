// Get current theme settings for a project
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event);

  return {
    accentColor: project.accent_color,
    fontFamily: project.font_family,
    bgColor: project.bg_color,
    bgSubtle: project.bg_subtle,
    textColor: project.text_color,
    textColorMuted: project['text-muted'],
    borderColor: project.border_color,
    radius: project.radius,
  };
});
