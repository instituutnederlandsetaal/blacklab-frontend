package nl.inl.corpuswebsite.velocity;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;

import org.apache.velocity.Template;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.runtime.RuntimeServices;
import org.apache.velocity.runtime.RuntimeSingleton;
import org.apache.velocity.runtime.parser.ParseException;

public class TemplateUtils {
    public static Template loadTemplate(InputStream input, String templateName) {
        try {
            RuntimeServices runtimeServices = RuntimeSingleton.getRuntimeServices();
            Template template = new Template();
            template.setRuntimeServices(runtimeServices);
            template.setName(templateName);
            runtimeServices.parse(new InputStreamReader(input, StandardCharsets.UTF_8), template);
            template.initDocument();
            return template;
        } catch (ParseException e) {
            throw new RuntimeException("Failed to parse template content", e);
        }
    }

    public static Template loadTemplate(File template) throws IOException {
        return loadTemplate(new FileInputStream(template), template.getName());
    }

    public static String renderTemplateToString(Template template, VelocityContext context) {
        StringWriter writer = new StringWriter();
        template.merge(context, writer);
        return writer.toString();
    }

    public static String renderTemplateToString(File f, VelocityContext context) throws IOException {
        return renderTemplateToString(loadTemplate(f), context);
    }
}
