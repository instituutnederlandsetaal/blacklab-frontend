package nl.inl.corpuswebsite.velocity;

import jakarta.servlet.ServletContext;
import org.apache.velocity.exception.ResourceNotFoundException;
import org.apache.velocity.runtime.RuntimeSingleton;
import org.apache.velocity.runtime.resource.Resource;
import org.apache.velocity.runtime.resource.loader.ResourceLoader;
import org.apache.velocity.util.ExtProperties;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.UnsupportedEncodingException;

public class BlackLabFrontendVelocityTemplateLoader extends ResourceLoader {
    private ServletContext ctx = null;
    private String path = "/WEB-INF/templates/";

    @Override
    public void init(ExtProperties configuration) {
        // Get the context from the config, see MainServlet::startVelocity()
        this.ctx = (ServletContext) RuntimeSingleton.getRuntimeServices().getApplicationAttribute(ServletContext.class.getName());
    }

    @Override
    public Reader getResourceReader(String templateName, String encoding) throws ResourceNotFoundException {
        if (ctx == null) throw new IllegalStateException("ServletContext not initialized");
        try {
            InputStream is = ctx.getResourceAsStream(this.path + templateName);
            if (is == null) {
                throw new ResourceNotFoundException("Could not find template: " + templateName);
            }
            if (encoding == null) {
                encoding = "UTF-8";
            }
            return new InputStreamReader(is, encoding);
        } catch (UnsupportedEncodingException e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public boolean isSourceModified(Resource resource) {
        return false;
    }

    @Override
    public long getLastModified(Resource resource) {
        return 0;
    }
}
